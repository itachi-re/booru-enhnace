# Security Policy

Booru Enhancer is a client-side userscript with no remote backend. Still, because it makes network requests (`GM_xmlhttpRequest`), triggers downloads (`GM_download`), and runs in the context of the sites it's matched against, security issues are taken seriously.

## Reporting a vulnerability

If you find a security issue — for example, a way the script could leak data to an unintended domain, be abused for XSS on a matched site, or mishandle stored settings — please **do not open a public issue** with exploit details.

Instead, report it privately via GitHub's [private vulnerability reporting](https://github.com/itachi-re/booru-enhnace/security/advisories/new) for this repository, or open a regular issue asking for a private contact channel if that's not enabled.

Please include:
- The affected version (`// @version` from the userscript header)
- Steps to reproduce
- The site(s)/adapter(s) involved, if relevant
- Impact, as far as you can assess it

## Scope

In scope: the userscript itself (`booru-enhancer.user.js`) and its interaction with matched sites and the external services listed in its `@connect` metadata.

Out of scope: vulnerabilities in the booru sites themselves, your userscript manager, or your browser.
