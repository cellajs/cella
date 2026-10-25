// Why this binds first: frontend/src/lib/README.md, "History wrappers".
history.pushState = history.pushState.bind(history);
history.replaceState = history.replaceState.bind(history);
