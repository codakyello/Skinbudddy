## Routine/Product Separation

- [x] **Normalization Guard**
  - Exclude routine `recommendations` from the shared product-normalization path.
- [x] **Payload Cleanup**
  - Suppress generic `products` when a routine is present so frontend sees only one rendering path.
- [x] **Validation**
  - Run lint/type-check to confirm the adjustment. (Lint passes; Modal hook warning persists.)

## Assistant Reply Headlines

- [x] **Summary Metadata**
  - Add optional `summary` object (headline, subheading, icon) to model responses, populated only when structured data is available.
- [x] **Streaming Payload**
  - Include `summary` in `/api/chat` SSE payloads.
- [x] **Frontend Rendering**
  - Render the summary block when present; otherwise fall back to current layout.
- [x] **Validation**
  - Run lint/type-check after the update.

## Routine Alternatives

- [x] **Server Options**
  - Return primary + alternate product options per step from `convex/products.recommend`.
- [x] **Tool Sanitization**
  - Preserve alternatives through `recommendRoutine` handler and API sanitization.
- [x] **UI Hookup**
  - Surface alternates alongside the main product card in routine replies.
- [x] **Validation**
  - Type-check end-to-end after schema/type updates.
