---
name: new-component
description: Create a new React component for VocaFlow. Use when asked to build any UI component, screen, or page.
---

Create a new React functional component following VocaFlow standards:

1. Read the existing components in /frontend/src/components/ first to match patterns
2. Create the component file with TypeScript props interface
3. Use named export only, never default export
4. Create a matching CSS module file alongside it
5. Add it to /frontend/src/components/index.ts exports

Standards:
- Functional components with hooks only
- Props interface named ComponentNameProps
- No inline styles, always CSS modules
- Handle loading and error states always