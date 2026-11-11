# E-wallet dashboard artwork

Reference: user-supplied `Top Up E-Wallet Dashboard.png`.

Generated with the built-in image generation tool (stylized-concept, transparent background) on 2026-10-25. `hero.webp` retains the detailed original; `hero.avif` is an 800-pixel compressed version with alpha, embedded in index.html so no backend or static route change is needed. Both files live in this directory. The generated original remains under the Codex generated_images directory.

Only the decorative phone/wallet/coins illustration is a bitmap. All headings, cards, provider labels, icons, search, sorting, cart, help and empty states are native HTML/CSS/SVG. Provider artwork is decorative; selecting a card opens an unsent availability question in the existing Customer Service form. It does not create an order or assert a live provider connection. The cart entry and badge use the existing catalog cart and its quantity display. No database, backend, authentication, admin, AI request or Shopee purchase logic is changed.

Responsive layout: three provider columns on desktop, two on tablet, one on phones. The hero stacks on smaller screens. Native controls have keyboard focus states; animation uses transform/opacity and respects prefers-reduced-motion. Filtering failure restores all choices and hides unavailable tools.

## Final prompt (built-in tool mode)

Use case: stylized-concept. Asset type: decorative 3D illustration for the right half of an Indonesian e-wallet dashboard hero, isolated on a genuinely transparent background. A glossy bright orange leather digital wallet with a white lightning bolt on its front, slightly open with a cream payment card peeking out, standing in front of an upright slim smartphone angled gently to the right with a warm apricot screen and a subtle black camera notch. Three floating gold coins embossed with a simple currency symbol around the wallet. Premium polished soft 3D product render, rounded forms, translucent peach highlights, gentle ambient shadows, tasteful cream and vivid orange palette. Three quarter front view, all objects fully inside the frame, balanced compact composition, generous transparent padding. Crisp attractive product silhouette, no words, no brand logo, no interface, no background, no watermark. Similar to the orange wallet-and-phone sculpture in a premium pale peach banking app banner.
