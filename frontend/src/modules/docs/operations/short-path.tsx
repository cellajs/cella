import { HighlightText } from '~/modules/common/match-highlight/highlight-text';

const scopeSegments = /\/(tenant|organization)s\/\{\1Id\}/g;

/** An operation path with the tenant and organization segments most paths repeat cut to `/t…/{t…Id}/o…/{o…Id}`; assistive technology reads it whole. */
export function ShortPath({ path }: { path: string }) {
  const shortPath = path.replace(scopeSegments, (_, name: string) => `/${name[0]}…/{${name[0]}…Id}`);

  return (
    <>
      <span className="sr-only">{path}</span>
      {/* The mark keeps the leading slash in place inside a dir="rtl" box, which cuts a long path at its start */}
      <span aria-hidden>
        &lrm;
        <HighlightText text={shortPath} />
      </span>
    </>
  );
}
