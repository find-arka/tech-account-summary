# Tech Account Summary

A client-side environment review questionnaire. Runs entirely in the browser — no data is sent to any server or stored in any database.

**[View Source](https://github.com/find-arka/tech-account-summary)**

## Features

- **16 structured sections** covering architecture, operations, security, support experience, and more
- **Dark / Light mode** — automatically follows OS preference
- **Markdown support** — text areas render Markdown via the marked library
- **File uploads** — attach architecture diagrams and screenshots (base64, stays in-browser)
- **Save / Load JSON** — export responses to a JSON file and reload them later
- **Document generation** — produce a formatted summary document from your answers
- **Print to PDF** — clean print stylesheet with forced light mode
- **AI-agent friendly** — JSON-LD schema, semantic HTML, and programmatic APIs (`window.getFormSchema()`, `window.fillForm()`)

## Usage

Open `index.html` in any modern browser. No build step or server required.

1. Fill in the questionnaire sections relevant to your account
2. Use **Save JSON** to persist your progress locally
3. Use **Generate Document** to create a formatted summary
4. Print or export to PDF via the browser print dialog

## Privacy & Security

All processing happens client-side within the browser sandbox. The application is a static HTML page with no backend, no analytics, no cookies, and no external network calls beyond loading fonts and the marked.js library from CDNs. See the in-page privacy panel for full details.

## License

See repository for license information.
