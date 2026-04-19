# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately via GitHub Security Advisories:
https://github.com/YuujiKamura/GASPhotoAIManager/security/advisories/new

Do NOT open a public issue for security problems.

We aim to respond within 7 days.

## Supported Versions

Only the `main` branch is supported. This is a personal project with no versioned releases.

## Threat Model

This app is a browser-only BYOK (Bring Your Own Key) tool. Users provide their own Google AI Studio API key, stored in localStorage. The app has no backend that handles user keys.

Primary risks we care about:
- XSS / supply chain: any compromise that reads localStorage
- Build-time key injection: keys embedded into client bundle at build time

Out of scope:
- DoS of the static site
- Abuse of the user's own API key by themselves
