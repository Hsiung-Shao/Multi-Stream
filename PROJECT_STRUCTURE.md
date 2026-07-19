# PROJECT_STRUCTURE.md

## Technology Stack
| Category | Technology |
|----------|------------|
| Framework | React 18 |
| Build Tool | Vite |
| Language | TypeScript |
| Styling | Tailwind CSS, Shadcn UI / Radix UI |
| State | Zustand |
| Tests | Vitest, Testing Library |

## Directory Tree
```
multi-stream/
  src/
    components/        React UI, canvas, navigation, dialogs
    features/          Twitch, favorites, feedback, admin modules
    hooks/             Shared React hooks
    i18n/              Locale resources
    store/             Zustand stores
    types/             Shared TypeScript types
    utils/             Layout, stream, security, analytics helpers
  tests/               Unit and component tests
  functions/           Cloudflare Pages API functions
  public/              Static assets and documentation images
  scripts/             Build and maintenance scripts
```

## Module Descriptions
- `src/components/Canvas/` - Draggable and resizable canvas window system.
- `src/components/Pages/CanvasStreamContent.tsx` - Canvas stream/chat window content and controls.
- `src/components/ChatSidebar.tsx` - Fixed multi-chat sidebar layout.
- `src/utils/layoutPresets.ts` - Canvas layout templates including chat layouts.
- `src/store/useStreamStore.ts` - Stream, canvas item, and layout state.

## Changelog
| Date | Changes |
|------|---------|
| 2026-07-19 | Initial structure note; documented chat window overlay fix context. |
