
# Cella Accessibility Conformance Report (VPAT® 2.5)

## Cella by Cella

**Product Name:** Cella  
**Product Description:**  
**Report Date:** June 2026  
**Evaluation Standard:** WCAG 2.2 Level AA  
**VPAT Version:** 2.5  
**Contact:** info@cellajs.com

---

# Evaluation Methods Used

- Automated testing (Lighthouse, WAVE, axe)
- Keyboard-only testing
- Screen reader testing (NVDA, VoiceOver)
- Browser zoom and reflow testing
- Color contrast verification
- Manual accessibility review of core user flows

---

# Applicable Standards

| Standard | Included |
|----------|----------|
| WCAG 2.2 Level A | Yes |
| WCAG 2.2 Level AA | Yes |
| WCAG 2.2 Level AAA | No |
| EN 301 549 | Yes |

---

# Conformance Terminology

- **Supports** – Meets the criterion.
- **Partially Supports** – Some functionality does not fully meet the criterion.
- **Does Not Support** – Criterion is not met.
- **Not Applicable** – Criterion does not apply.
- **Not Evaluated** – Criterion not evaluated (AAA only).

---

# WCAG 2.2 Level A

| Criterion | Conformance |
|------------|------------|
| 1.1.1 Non-text Content | Supports |
| 1.2.1 Audio-only and Video-only | Not Applicable |
| 1.2.2 Captions (Prerecorded) | Not Applicable |
| 1.2.3 Audio Description or Media Alternative | Not Applicable |
| 1.3.1 Info and Relationships | Supports |
| 1.3.2 Meaningful Sequence | Supports |
| 1.3.3 Sensory Characteristics | Supports |
| 1.3.4 Orientation | Supports |
| 1.3.5 Identify Input Purpose | Supports |
| 1.4.1 Use of Color | Supports |
| 1.4.2 Audio Control | Not Applicable |
| 2.1.1 Keyboard | Partially Supports |
| 2.1.2 No Keyboard Trap | Supports |
| 2.1.4 Character Key Shortcuts | Not Applicable |
| 2.2.1 Timing Adjustable | Not Applicable |
| 2.2.2 Pause Stop Hide | Not Applicable |
| 2.3.1 Three Flashes | Supports |
| 2.4.1 Bypass Blocks | Supports |
| 2.4.2 Page Titled | Supports |
| 2.4.3 Focus Order | Supports |
| 2.4.4 Link Purpose | Supports |
| 2.5.1 Pointer Gestures | Not Applicable |
| 2.5.2 Pointer Cancellation | Supports |
| 2.5.3 Label in Name | Supports |
| 2.5.4 Motion Actuation | Not Applicable |
| 3.1.1 Language of Page | Supports |
| 3.2.1 On Focus | Supports |
| 3.2.2 On Input | Supports |
| 3.2.6 Consistent Help (NEW WCAG 2.2) | Supports |
| 3.3.1 Error Identification | Supports |
| 3.3.2 Labels or Instructions | Supports |
| 3.3.7 Redundant Entry (NEW WCAG 2.2) | Supports |
| 4.1.2 Name Role Value | Supports |

---

# WCAG 2.2 Level AA

| Criterion | Conformance |
|------------|------------|
| 1.2.4 Captions (Live) | Not Applicable |
| 1.2.5 Audio Description | Not Applicable |
| 1.4.3 Contrast (Minimum) | Supports |
| 1.4.4 Resize Text | Supports |
| 1.4.5 Images of Text | Supports |
| 1.4.10 Reflow | Supports |
| 1.4.11 Non-text Contrast | Supports |
| 1.4.12 Text Spacing | Supports |
| 1.4.13 Content on Hover or Focus | Supports |
| 2.4.5 Multiple Ways | Supports |
| 2.4.6 Headings and Labels | Supports |
| 2.4.7 Focus Visible | Supports |
| 2.4.11 Focus Not Obscured (Minimum) (NEW WCAG 2.2) | Supports |
| 2.5.7 Dragging Movements (NEW WCAG 2.2) | Supports |
| 2.5.8 Target Size (Minimum) (NEW WCAG 2.2) | Supports |
| 3.1.2 Language of Parts | Supports |
| 3.2.3 Consistent Navigation | Supports |
| 3.2.4 Consistent Identification | Supports |
| 3.3.3 Error Suggestion | Supports |
| 3.3.4 Error Prevention | Supports |
| 3.3.8 Accessible Authentication (Minimum) (NEW WCAG 2.2) | Supports |
| 4.1.3 Status Messages | Supports |

---

# WCAG 2.2 Level AAA

Not evaluated. Cella does not claim WCAG 2.2 Level AAA conformance. Level AAA would require meeting all applicable Level A, Level AA, and Level AAA success criteria. The following WCAG 2.2 AAA criteria were not evaluated or claimed:

- 2.4.12 Focus Not Obscured (Enhanced): When a user interface component receives keyboard focus, the component must not be entirely hidden by author-created content.
- 2.4.13 Focus Appearance: The keyboard focus indicator must meet enhanced minimum requirements for visibility, including sufficient size and contrast.
- 3.3.9 Accessible Authentication (Enhanced): Authentication must not rely on a cognitive function test, memorization, or transcription unless an accessible alternative is provided.

---

# EN 301 549 Summary

Buddycheck substantially conforms with EN 301 549 requirements applicable to web-based software through conformance with WCAG 2.2 AA. Hardware, relay services, and telecommunication-specific requirements are not applicable.

---

# Known Limitations

- Certain advanced workflows may require additional keyboard verification.
- Accessibility testing is performed on current supported browsers and assistive technologies.
- Third-party embedded content may have separate accessibility characteristics.

---

# Legal Disclaimer

This document is provided for informational purposes only. Accessibility characteristics may change as the product evolves. Cella makes no warranties regarding the completeness of this document and reserves the right to update accessibility information without notice.
