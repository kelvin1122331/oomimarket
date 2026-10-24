# Choice screen artwork

Created using built-in imagegen with the supplied choice-screen image as a style/composition reference. Five transparent decorative illustrations and one room backdrop are optimized to WebP and embedded in index.html; backend routes remain unchanged. Labels, descriptions, icons and entire clickable cards are native HTML/SVG.

## Files

- hero-3d.webp: 760 x 760
- catalog-3d.webp, social-3d.webp, webdev-3d.webp, reseller-3d.webp: 460 x 345
- room-background.webp: 1000 x 1333

## Prompts

### hero

Reference role: visual style reference, the top-right hero shopping bag ONLY. Generate one isolated high-end 3D illustration with genuine transparent background: large glossy orange shopping bag with orange tubular handles standing tilted slightly on a polished orange circular pedestal, small floating orange cart, heart and star tiles surrounding it, a thin sweeping gold orbital light ribbon. Premium peach/orange studio light, creamy glass reflections, cinematic 3D materials like the reference. Square canvas, entire object and pedestal inside with generous margin. No text, no logo, no website UI, no cards, no buttons, no headings, no background. Decorative hero asset for an existing functional website.

### catalog

Reference role: style and subject reference for first option card. Create ONE isolated glossy 3D shopping illustration on transparent background: two rich orange shopping bags beside a floating ivory rounded product display card showing a realistic orange sneaker, a small cream/gold circular pedestal and subtle golden light swoosh. Compact landscape 4:3 composition, entire objects visible with margins. Premium warm peach studio lighting and glassy reflections matching reference. No words, no letters, no logo, no UI, no button, no background or website mockup.

### social

Reference role: style and subject reference for second option card. Create ONE isolated glossy 3D social media illustration on transparent background: recognizable Instagram gradient camera tile, black TikTok musical-note tile and red YouTube white play-button tile, arranged as three floating rounded thick 3D app tiles, small orange heart notification and gold sparkles, on a subtle translucent peach circular pedestal. Compact landscape 4:3 composition, entire objects visible with margins, premium orange/peach studio lighting matching reference. No text or lettering, no website UI, no background, no heading.

### webdev

Reference role: style and subject reference for third option card. Create ONE isolated premium 3D website development illustration on transparent background: open metallic laptop with glossy dark orange/brown screen showing ONLY a large glowing orange code bracket symbol </>, small floating orange browser/dashboard panels around it, warm peach translucent round pedestal, subtle golden glow. Three-quarter front perspective, compact landscape 4:3 composition, entire laptop visible with clear margins. Match polished warm orange and cream 3D reference style. No words, letters, labels, brand logos, UI buttons, background or website mockup.

### reseller

Reference role: style and subject reference for fourth option card. Create ONE isolated premium 3D reseller/business illustration on transparent background: a glossy warm orange cube parcel with ribbon seams and a metallic gold crown sitting on top, small floating orange percent discount tile at right and a small orange community/people tile at left, cream/orange translucent circular podium and thin gold light ring. Compact landscape 4:3 composition, objects entirely visible with margins, warm peach studio lighting and shiny high quality materials exactly like reference. No text or lettering, no brand name, no website UI, no background or rectangle.

### background

Edit reference into ONE CLEAN decorative website BACKGROUND, portrait 3:4. Preserve the warm cream and peach premium 3D studio/shop room: soft abstract ivory wall panels, blurred little green plant and orange pot at far left around middle, orange parcels in background at lower edges, a shopping bag cropped bottom-left, sweeping shiny orange/gold ribbon with thin luminous light trails across bottom, small orange percent tile bottom-right. REMOVE ALL website typography, heading, brand lockup, text, buttons, back control and all four translucent option cards and their objects. Also REMOVE the big top-right hero bag/podium; keep that area soft warm empty room for separate illustration overlay. Main central 85% must be clean calm light cream/peach negative space for live HTML. No letters, logos, words, UI, panels containing text. Match reference materials, soft-focus depth, rich warm highlights. This is only the background behind actual working HTML, not a website screenshot.

## Inline delivery optimization

The HTML embeds display-sized WebP derivatives (quality 72, alpha quality 70): storefront cart 620 px, support 360 px, choice hero 560 px, choice cards 340 px, room backdrop 850 px. Combined encoded image bytes are 173048 before Base64. Original higher-resolution artwork remains available in assets for future layouts. No server or API changes are required.

Delivery update: index.html now uses compact AVIF derivatives of these WebP sources; the original artwork remains available here. See assets/services/README.md for delivery details.
