canaryos the always-running scam detector app to keep you or your family fully protected from scams across all apps and devices.

Tech stack:
- react native
- expo go
- some on-device AI model?
- Vercel AI SDK for cloud using google provider



Color scheme:

primary: Canary Yellow (hex: #FFD300)
secondary: Charcoal Black (#1C1C1C)
tertiary: Gunmetal Gray (#242424)
off-white: Off-White (hex: #F5F5F5)
alert red: Alert Red (hex: #E63946)
trust blue: Trust Blue (hex: #0077B6)

UI design principles:
- Clean, modern, and minimalistic
- Easy to use
- Fast and responsive
- Clear and concise
- Consistent and professional
NOTE: No clutter, no fancy gradients, avoid emojis, have few icons, keep everything simple and intuitive (Core, often-used features show up right away and are one-click and done.)

Phase 1: 
Basic expo go app, where users can upload a screenshot of a potential scam, and the app will analyze it and determine if it is a scam or not, explaining why or why not. Uses Vercel AI SDK for cloud using google provider.

Phase 2: 
Overlay app, that runs in the background. User can click one button on the overlay to take a screenshot and analyze it for potential scams.

Phase 3:
- Implement community blacklist/whitelist for links + integration with existing APIs and databases
- Always running ML model for analysis of emails and SMS

Phase 4:
- Implement voice mail analysis
- Implement phone number checking