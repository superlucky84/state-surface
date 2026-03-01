import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../engine/server/index.js';

let app: any;
beforeAll(async () => {
  ({ app } = await createApp());
});
import { guideContent, guideLoadedState } from './content.js';
import type { Block } from './content.js';

const CONCEPT_SLUGS = ['surface', 'template', 'transition', 'action', 'accumulate'] as const;
const ALL_SLUGS = ['quickstart', 'surface', 'template', 'transition', 'action', 'accumulate'] as const;
const LANGS = ['en', 'ko'] as const;
const REQUIRED_SECTION_IDS = ['tldr', 'analogy', 'when', 'steps', 'example', 'sequence', 'mistakes', 'debug', 'next'];
const SURFACE_EXTRA_SECTION_IDS = ['mixed'];
const TRANSITION_EXTRA_SECTION_IDS = ['animation'];
const QUICKSTART_REQUIRED_SECTION_IDS = [
  'preview', 'prereqs', 'step1', 'step2', 'step3', 'flow', 'verify', 'next',
];

// ── Schema validation — concept guides ──

describe('guide content schema (concept guides)', () => {
  for (const slug of CONCEPT_SLUGS) {
    for (const lang of LANGS) {
      describe(`${slug} (${lang})`, () => {
        it('has all required sections', () => {
          const guide = guideContent(slug, lang);
          expect(guide).not.toBeNull();
          const ids = guide!.sections.map(s => s.id);
          for (const required of REQUIRED_SECTION_IDS) {
            expect(ids).toContain(required);
          }
          if (slug === 'surface') {
            for (const extra of SURFACE_EXTRA_SECTION_IDS) {
              expect(ids).toContain(extra);
            }
          }
          if (slug === 'transition') {
            for (const extra of TRANSITION_EXTRA_SECTION_IDS) {
              expect(ids).toContain(extra);
            }
          }
        });

        it('each section has at least one block', () => {
          const guide = guideContent(slug, lang);
          for (const section of guide!.sections) {
            expect(section.blocks.length).toBeGreaterThan(0);
          }
        });

        it('has a code block in the example section', () => {
          const guide = guideContent(slug, lang);
          const example = guide!.sections.find(s => s.id === 'example');
          expect(example).toBeDefined();
          const hasCode = example!.blocks.some((b: Block) => b.type === 'code');
          expect(hasCode).toBe(true);
        });

        it('has a checklist block in the mistakes section', () => {
          const guide = guideContent(slug, lang);
          const mistakes = guide!.sections.find(s => s.id === 'mistakes');
          expect(mistakes).toBeDefined();
          const hasChecklist = mistakes!.blocks.some((b: Block) => b.type === 'checklist');
          expect(hasChecklist).toBe(true);
        });

        it('has a warning block in the mistakes section', () => {
          const guide = guideContent(slug, lang);
          const mistakes = guide!.sections.find(s => s.id === 'mistakes');
          const hasWarning = mistakes!.blocks.some((b: Block) => b.type === 'warning');
          expect(hasWarning).toBe(true);
        });

        it('has a sequence block in the steps section', () => {
          const guide = guideContent(slug, lang);
          const steps = guide!.sections.find(s => s.id === 'steps');
          expect(steps).toBeDefined();
          const hasSequence = steps!.blocks.some((b: Block) => b.type === 'sequence');
          expect(hasSequence).toBe(true);
        });

        it('steps section has at least 5 steps', () => {
          const guide = guideContent(slug, lang);
          const steps = guide!.sections.find(s => s.id === 'steps');
          const seqBlock = steps!.blocks.find((b: Block) => b.type === 'sequence');
          expect(seqBlock).toBeDefined();
          if (seqBlock?.type === 'sequence') {
            expect(seqBlock.steps.length).toBeGreaterThanOrEqual(5);
          }
        });

        it('has demoHref and demoLabel', () => {
          const guide = guideContent(slug, lang);
          expect(guide!.demoHref).toBeTruthy();
          expect(guide!.demoLabel).toBeTruthy();
        });

        it('guideLoadedState includes demoHref and demoLabel', () => {
          const state = guideLoadedState(slug, lang);
          expect(state).not.toBeNull();
          expect(state!.demoHref).toBeTruthy();
          expect(state!.demoLabel).toBeTruthy();
          expect(state!.sections.length).toBeGreaterThan(0);
        });
      });
    }
  }
});

// ── Schema validation — quickstart ──

describe('guide content schema (quickstart)', () => {
  for (const lang of LANGS) {
    describe(`quickstart (${lang})`, () => {
      it('exists and has all 8 required sections', () => {
        const guide = guideContent('quickstart', lang);
        expect(guide).not.toBeNull();
        const ids = guide!.sections.map(s => s.id);
        for (const required of QUICKSTART_REQUIRED_SECTION_IDS) {
          expect(ids).toContain(required);
        }
      });

      it('each section has at least one block', () => {
        const guide = guideContent('quickstart', lang);
        for (const section of guide!.sections) {
          expect(section.blocks.length).toBeGreaterThan(0);
        }
      });

      it('has a diagram block in the preview section', () => {
        const guide = guideContent('quickstart', lang);
        const preview = guide!.sections.find(s => s.id === 'preview');
        expect(preview).toBeDefined();
        expect(preview!.blocks.some((b: Block) => b.type === 'diagram')).toBe(true);
      });

      it('has an analogy block in step sections', () => {
        const guide = guideContent('quickstart', lang);
        const hasAnalogy = guide!.sections.some(s =>
          s.blocks.some((b: Block) => b.type === 'analogy'),
        );
        expect(hasAnalogy).toBe(true);
      });

      it('has callout blocks for tips', () => {
        const guide = guideContent('quickstart', lang);
        const hasCallout = guide!.sections.some(s =>
          s.blocks.some((b: Block) => b.type === 'callout'),
        );
        expect(hasCallout).toBe(true);
      });

      it('has at least 3 code blocks across all sections', () => {
        const guide = guideContent('quickstart', lang);
        const codeCount = guide!.sections.reduce(
          (sum, s) => sum + s.blocks.filter((b: Block) => b.type === 'code').length,
          0,
        );
        expect(codeCount).toBeGreaterThanOrEqual(3);
      });

      it('has demoHref and demoLabel', () => {
        const guide = guideContent('quickstart', lang);
        expect(guide!.demoHref).toBeTruthy();
        expect(guide!.demoLabel).toBeTruthy();
      });
    });
  }
});

// ── i18n equality ──

describe('guide i18n equality (en/ko parity)', () => {
  for (const slug of ALL_SLUGS) {
    describe(slug, () => {
      it('en and ko have the same number of sections', () => {
        const en = guideContent(slug, 'en');
        const ko = guideContent(slug, 'ko');
        expect(en!.sections.length).toBe(ko!.sections.length);
      });

      it('en and ko section IDs match in order', () => {
        const en = guideContent(slug, 'en');
        const ko = guideContent(slug, 'ko');
        const enIds = en!.sections.map(s => s.id);
        const koIds = ko!.sections.map(s => s.id);
        expect(enIds).toEqual(koIds);
      });

      it('en and ko block counts match per section', () => {
        const en = guideContent(slug, 'en');
        const ko = guideContent(slug, 'ko');
        for (let i = 0; i < en!.sections.length; i++) {
          const enSection = en!.sections[i];
          const koSection = ko!.sections[i];
          expect(koSection.blocks.length).toBe(enSection.blocks.length);
        }
      });

      it('en and ko block types match per section', () => {
        const en = guideContent(slug, 'en');
        const ko = guideContent(slug, 'ko');
        for (let i = 0; i < en!.sections.length; i++) {
          const enTypes = en!.sections[i].blocks.map((b: Block) => b.type);
          const koTypes = ko!.sections[i].blocks.map((b: Block) => b.type);
          expect(koTypes).toEqual(enTypes);
        }
      });
    });
  }
});

// ── SSR rendering ──

describe('guide SSR rendering', () => {
  for (const slug of ALL_SLUGS) {
    it(`GET /guide/${slug} renders guide page with loading skeleton`, async () => {
      const res = await request(app).get(`/guide/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('<h-state name="guide:content"');
      expect(res.text).toContain('<h-state name="guide:toc"');
      expect(res.text).toContain('animate-pulse');
    });

    it(`/transition/guide-load for ${slug} returns sections with blocks`, async () => {
      const res = await request(app)
        .post('/transition/guide-load')
        .send({ slug, lang: 'en' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);

      const lines = res.text
        .trim()
        .split('\n')
        .map((l: string) => JSON.parse(l));

      const loadedFrame = lines.find(
        (l: any) => l.type === 'state' && l.full === false && l.states?.['guide:content']?.sections,
      );
      expect(loadedFrame).toBeDefined();

      const content = loadedFrame.states['guide:content'];
      const baseCount =
        slug === 'quickstart' ? QUICKSTART_REQUIRED_SECTION_IDS.length : REQUIRED_SECTION_IDS.length;
      const extraCount =
        slug === 'surface'
          ? SURFACE_EXTRA_SECTION_IDS.length
          : slug === 'transition'
            ? TRANSITION_EXTRA_SECTION_IDS.length
            : 0;
      const expectedCount = baseCount + extraCount;
      expect(content.sections.length).toBe(expectedCount);
      expect(content.demoHref).toBeTruthy();
      expect(content.demoLabel).toBeTruthy();
    });
  }
});
