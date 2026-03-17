# Front Workspace Guide

## Overview

- This directory contains a Next.js App Router project.
- Core stack:
  - Next.js 16
  - React 19
  - TypeScript
  - Tailwind CSS v4
  - shadcn/ui
  - axios
- Import alias:
  - `@/*` -> `src/*`

## Current Structure

- App entry:
  - `src/app/layout.tsx`
  - `src/app/page.tsx`
- Shared UI:
  - `src/components/ui/*`
- Shared utilities:
  - `src/lib/*`
- API layer:
  - `src/lib/api/config.ts`
  - `src/lib/api/client.ts`
  - `src/lib/api/websocket.ts`

## UI / Branding Rules

- Always reference `.kiro/specs/meeting-alignment-ai/branding.md` before making visual decisions.
- The project is dark-mode-first.
- Tone should feel calm, low-noise, and information-dense rather than flashy.
- Typography baseline:
  - Sans: `Inter`
  - Mono: `JetBrains Mono`
- Theme tokens already reflect the branding guide in `src/app/globals.css`.
- Prefer shadcn/ui components for new UI instead of ad-hoc primitives.

## API Configuration

### Base URLs

- HTTP base URL is defined in `src/lib/api/config.ts`.
- WebSocket base URL is also defined there for future realtime features.

Current values:

```ts
const API_HOST = "localhost:8080";

export const API_BASE_URL = `http://${API_HOST}`;
export const WS_BASE_URL = `ws://${API_HOST}`;
```

## Axios Usage

- Always use the shared `apiClient` from `src/lib/api/client.ts`.
- Do not scatter raw `axios.create(...)` calls across feature code.
- Do not hardcode `http://localhost:8080` in pages, components, or hooks.
- Keep endpoint paths relative, such as `"/meetings"` or `"/api/sessions"`.

Shared client:

```ts
import { apiClient } from "@/lib/api/client";

const response = await apiClient.get("/meetings");
return response.data;
```

POST example:

```ts
import { apiClient } from "@/lib/api/client";

await apiClient.post("/meetings", {
  title: "Sprint Planning",
});
```

## WebSocket Preparation

- Use the shared URL helper in `src/lib/api/websocket.ts` when creating realtime connections.
- Do not hardcode `ws://localhost:8080` in component code.
- Always pass a path and let the helper normalize the leading slash.

Example:

```ts
import { createWebSocketUrl } from "@/lib/api/websocket";

const socket = new WebSocket(createWebSocketUrl("/ws/meetings"));
```

This also works:

```ts
createWebSocketUrl("ws/meetings");
```

## Recommended Conventions

- Add feature-specific API functions under `src/lib/api/` or a nearby feature module.
- Keep React components focused on rendering and interaction; move request logic into reusable helpers when it starts repeating.
- If auth, interceptors, refresh tokens, or common error mapping are introduced later, extend the shared `apiClient` rather than bypassing it.
- If the backend switches host by environment later, update `config.ts` first and keep the rest of the app unchanged.

## Quick References

- Shared axios client: `src/lib/api/client.ts`
- Shared base URLs: `src/lib/api/config.ts`
- WebSocket URL builder: `src/lib/api/websocket.ts`
- Brand theme tokens: `src/app/globals.css`
- Layout and fonts: `src/app/layout.tsx`
