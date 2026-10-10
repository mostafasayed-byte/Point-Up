import { createContext, useContext, useEffect, useRef } from 'react';
import { pagesLabel } from '../lib/util';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/* رسالة حالة: نص أو {text, link} */
export function Msg({ m, className = 'note' }) {
  if (!m) return <div className={className} role="status" />;
  const o = typeof m === 'string' ? { text: m } : m;
  return (
    <div className={className + (o.error ? ' err' : '')} role="status">
      {o.busy && <span className="spin" aria-hidden="true" />}
      {o.text}
      {o.link && (
        <>
          {' '}
          <a href={o.link.url} target="_blank" rel="noopener noreferrer" {...(o.link.external ? {} : { download: o.link.name })}>
            {o.link.external ? o.link.name : 'فتح الملف'}
          </a>
        </>
      )}
    </div>
  );
}

export const busy = (text) => ({ text, busy: true });
export const fail = (text) => ({ text, error: true });

/* عرض صفحات المستند كصور */
export function PagesView({ pages, title, onClose, closeLabel = 'إغلاق العرض' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (pages && ref.current) ref.current.scrollIntoView({ behavior: 'smooth' });
  }, [pages]);
  if (!pages) return null;
  return (
    <div ref={ref}>
      <h2 style={{ marginTop: 12 }}>{title} — {pagesLabel(pages.length)}</h2>
      <div className="pages">
        {pages.map((u, i) => <img key={i} src={u} alt={'صفحة ' + (i + 1)} />)}
      </div>
      <button className="alt big" type="button" onClick={onClose}>{closeLabel}</button>
    </div>
  );
}

export function Field({ label, id, children }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {children}
    </>
  );
}

export function Check({ checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> {children}
    </label>
  );
}
