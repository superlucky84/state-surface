import type {
  ActionEvent,
  PagePluginEntry,
  PluginEvents,
  PluginHost,
  SlotKind,
} from './pluginHost.js';

type Report = (error: unknown, detail: Record<string, unknown>) => void;

/**
 * Loader side of the plugins (DC-12, DESIGN 5.1): pages without plugins never load the
 * plugin host chunk, and pages with plugins load it at once when an entry loads at `load`,
 * else when the browser is idle (the host then waits for `visible` entries itself, so the
 * loader carries no scheduler). Until then the relay
 * remembers which slots are displayed (the host attaches late plugins to them, as it does
 * for late plugin chunks) and drops action events, which no plugin could have seen yet.
 * Page lifetime calls go to the host once it exists.
 */
export class PluginRelay implements PluginEvents {
  private host?: PluginHost;
  private loading?: Promise<void>;
  private displayed = new Map<string, { el: HTMLElement; mode: SlotKind }>();
  private entries: PagePluginEntry[] = [];
  private cancel?: () => void;

  constructor(
    private load: () => Promise<{
      createPluginHost(entries: PagePluginEntry[], report: Report): PluginHost;
    }>,
    private report: Report
  ) {}

  /** A page starts (document load or client navigation). */
  mountPage(entries: PagePluginEntry[], root: ParentNode = document) {
    this.entries = entries;
    if (this.host) return this.host.mountPage(entries, root);
    this.cancel?.();
    this.cancel = undefined;
    if (!entries.length || this.loading) return;
    if (entries.some(entry => entry.load === 'load')) return void this.start(root);
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(() => void this.start(root), { timeout: 2000 });
      this.cancel = () => cancelIdleCallback?.(handle);
    } else {
      const handle = setTimeout(() => void this.start(root), 1);
      this.cancel = () => clearTimeout(handle);
    }
  }

  private start(root: ParentNode) {
    this.cancel = undefined;
    return (this.loading ??= this.load().then(
      module => {
        const host = module.createPluginHost(this.entries, this.report);
        for (const [name, slot] of this.displayed) host.displayedSlot(name, slot.el, slot.mode);
        this.displayed.clear();
        this.host = host;
        host.start(root);
      },
      error => {
        this.loading = undefined;
        this.report(error, { kind: 'chunk', chunk: 'plugins' });
      }
    ));
  }

  /** A client navigation leaves the page: persisted slots stay displayed. */
  leavePage(persisted: ReadonlySet<string> = new Set()) {
    if (this.host) return this.host.leavePage(persisted);
    this.cancel?.();
    this.cancel = undefined;
    for (const name of [...this.displayed.keys()])
      if (!persisted.has(name)) this.displayed.delete(name);
  }

  displayedSlot(name: string, el: HTMLElement, mode: SlotKind) {
    if (this.host) this.host.displayedSlot(name, el, mode);
    else this.displayed.set(name, { el, mode });
  }

  updatedSlot(name: string) {
    this.host?.updatedSlot(name);
  }

  removedSlot(name: string) {
    if (this.host) this.host.removedSlot(name);
    else this.displayed.delete(name);
  }

  action(event: ActionEvent) {
    this.host?.action(event);
  }

  /** The host once it loaded (dev overlay, tests). */
  get loaded(): PluginHost | undefined {
    return this.host;
  }
}
