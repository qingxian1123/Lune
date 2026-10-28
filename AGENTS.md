# Project agent guidance

## Figma workflow

### Project map

- The React/TypeScript client is `apps/client`; `apps/shared` contains shared types and `server` is the NestJS/WebSocket backend.
- Inspect `apps/client/src/components` for shared UI and player pieces, `src/features` for feature-specific UI and controllers, `src/pages` for desktop pages, `src/desktop` for desktop layouts, and `src/mobile` for mobile views. There is no single generic UI component library: inspect existing markup and styles before introducing a primitive.
- Reuse appropriate existing pieces, such as `TransportBar`, `NowPlaying`, `Queue`, `LyricScroller`, `SearchPanel`, `HeartButton`, `VolumeIcon`, `WorkspaceMusicBrowser`, `SettingsShell`, and desktop room navigation and layout components. Check their props and behavior before reuse; do not duplicate them solely because a Figma component exists.
- Base colors and typography variables are in `apps/client/src/index.css`; theme overrides are in `src/app/daylight.css` and `src/app/frosted.css`, controlled by `src/app/ThemeProvider.tsx`. Tailwind is configured in `apps/client/tailwind.config.ts`, with no custom theme extensions at present. Spacing and radius are not a comprehensive centralized token set; search relevant existing CSS before adding a reusable token. Respect all three themes and responsive desktop/mobile layouts.
- From the repository root, use `pnpm dev:client` to start Vite. Its configured default is `http://localhost:5173/` with `strictPort`; check the actual server output and reuse an existing server when appropriate. Room screens may require a configured backend and room session; Tauri-specific appearance or behavior may differ from a browser.

### Figma design implementation

Use the available official Figma plugin and its applicable skills. Load `figma:figma-design-to-code` before `get_design_context`; load `figma:figma-use` before `use_figma`, and follow the relevant capture or creation skills when applicable. Observe the Figma server's current file-session and tool instructions.

1. Given a Figma frame URL, use the configured Figma remote MCP to inspect the selected frame before coding. Obtain available design context, hierarchy, component instances, variables, Auto Layout, typography, spacing, radii, colors, and a screenshot or other visual reference. If access or a capability is unavailable, state the limitation instead of inventing details.
2. Search relevant project components, features, pages, desktop/mobile layouts and styles first. Reuse compatible components, icons, CSS variables and theme conventions; introduce new components or tokens only when the design warrants them. Avoid unnecessary hardcoded near-duplicate values.
3. Treat Figma as the visual source of truth, while preserving behavior, accessibility, responsive states, existing routes, API and state management, player synchronization and network protocols unless the requested design change requires otherwise.
4. After implementation, run the client, inspect the rendered result at the relevant viewport and state, compare it to the Figma reference, and fix visible layout, spacing and typography differences. Report any inability to run or compare, including missing backend, permissions or reference.

### Code to Figma and round trip

For a request to send the current page to Figma, check for an existing dev server, start one if needed, confirm the actual URL and requested page/state, and use the remote MCP's live UI capture (`generate_figma_design`) if available. Follow the current tool instructions, including its file and browser interaction requirements; the currently available plugin tool requires an existing Figma Design file key. If a new file is requested, follow `figma:figma-create-new-file` before creating it. Prefer editable design layers; report the resulting file/frame link and any fidelity or permission limitations. Do not claim a capture succeeded without verification.

For a request to sync changes back, retrieve the latest linked frame and visual reference, compare them with the current implementation, and change only the relevant visual code while reusing existing components and tokens. Then run and visually compare the affected state. Do not refactor unrelated pages or logic. Preferred loop: prototype in code → run locally → capture to Figma → refine in Figma → read the updated frame → update code → visually verify.

Code Connect may be useful for stable, genuinely corresponding Figma and React components. Inspect the actual Figma component/variant properties and repository API first; do not create or publish speculative mappings.
