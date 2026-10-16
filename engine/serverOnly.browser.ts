throw new Error(
  '[state-surface] A server-only module was loaded in the browser. ' +
    'Remove the import chain from client components (see the build error for the path).'
);
