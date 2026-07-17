// Bind before observability, Maple, and the router install wrappers. See frontend/src/lib/README.md.
history.pushState = history.pushState.bind(history);
history.replaceState = history.replaceState.bind(history);
