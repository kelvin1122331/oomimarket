# Neon Customer Service presentation

Reference: user-supplied Neon Omnnimarket Support Chat.png.

Robot and background were generated separately using the built-in image generation tool (stylized-concept mode) on 2026-10-25. robot.webp/background.webp preserve detailed sources. The AVIF versions are optimized and embedded in index.html; the server and its static-file restrictions remain unchanged.

The original Customer Service form, textarea ID/name, 3-character minimum, 2,000-character maximum, close controls, conversation history and /api/customer-service request logic are preserved. No backend, database, authentication, admin, Shopee purchase or existing chat code was changed. The original main script is byte-identical to the pre-change source.

New UI helpers filter 12 suggested questions across eight categories, expand/collapse suggestions, navigate between chat and FAQ, show a live character count and indicate actual pending/error states from the original controls. Suggestions fill a draft and never submit automatically. Existing typed drafts are preserved; suggestions that exceed the original limit are rejected without truncation. Busy messages cannot be changed by a shortcut. Reset restores the default categories, and counters also update for game questions prefilled by the existing game catalogue.

Admin links use the existing owner Instagram profile. No unsupported file attachment, 24/7 availability, live online claim or invented admin hours are added. Mobile hides the decorative sidebar while retaining categories, FAQ, chat, composer and admin link. The composer remains outside the scrolling conversation on normal-height viewports; short screens can scroll the full main panel. Reduced motion disables transitions and entrance effects.

## Prompt set

### robot

Use case: stylized-concept. Supplied image is a style, material and lighting reference only. Asset type: transparent isolated 3D mascot for a customer support sidebar. A friendly glossy ivory-white small robot with black glass face, two glowing amber oval eyes, metallic dark headphones with warm orange illuminated edges and matching microphone, small rounded hands visible, a floating orange glass chat bubble with three white dots. Three-quarter front view, upper-body portrait, whole silhouette with padding. Premium polished plastic, soft lavender reflections, cinematic orange rim light. Match the robot at left of the reference. No words, branding, text, labels, UI or background.

### background

Use case: stylized-concept. Supplied image is a style, material and lighting reference only. Asset type: atmospheric background for a real customer support dialog. A softly defocused modern workspace at dusk, deep navy and charcoal tones at center and left, warm amber-orange lamps and blurred reflections at edges, subtly cool blue desk reflection near the lower edge. Very soft photographic depth of field, luxurious cinematic light. Wide landscape composition, central area dark enough for a glass interface overlay. No people, robots, text, logos, controls, buttons, screens with readable content or UI.

