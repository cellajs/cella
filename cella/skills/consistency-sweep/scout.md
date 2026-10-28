# The scout

A read-only agent that reads the group before any pass. Its report is what makes a pass precise: the pilot's first pass applied 12 of 13 coordinator leads and found 5 more; later groups ran on scout reports of 70 to 110 leads with a handful declined per pass.

## Prompt outline

- Read the shared brief (conventions, the maintainer's decisions, what counts as a lead) and an earlier scout report as the model of format and precision.
- Edit nothing. Read every target file of the group in full, plus whatever they import from the primitives when a class or pattern question depends on it. Tests and stories are context, not targets.
- Check every lead against the code, against every consumer outside the group (the brief's consumers section), and against the compiled CSS (`tw-check.mjs`) where a Tailwind claim needs it. Mark each lead high or medium confidence; skip anything without a `file:line`.
- Write the report with an opening block (how consumers relate to the group, which tests and stories cover it) and seven sections: 1 DRY and pattern reuse, 2 naming, 3 Tailwind A, 4 Tailwind B, 5 style and comments, 6 bugs and dead reads, 7 sizing (lines per file, the largest files, a split into halves that share no file when the group is over about 5,000 lines, the leads that cross out of the group).
- Final message: the file path and a 10-line summary with lead counts per section and the three leads it is most sure of.

## Lead format

One numbered item per lead: what it is, where (`file:line`), why it is better, what to check before applying, consumer impact, confidence. Flag a lead that would break a consumer outside the group ("needs a decision") and one that changes rendering ("visible change").
