/* إجراءات مشتركة على مستند صادر (من شاشة الإصدار أو من السجل) */
import { docPdf, docXlsx, docCanvases, docText } from './docRender.js';
import { doSave, cachedFile, shareFile, openWa } from './files.js';
import { typeLabel, msgText, errMsg } from './util.js';

export const docFile = (row) => cachedFile('doc:' + row.id, () => docPdf(row), row.no + '_' + row.serial + '.pdf');
export const prewarmDoc = (row) => { docFile(row).catch(() => {}); };

export async function exportDoc(row, kind) {
  try {
    if (kind === 'xl') return { text: await doSave(row.no + '.xlsx', await docXlsx(row)) };
    return { text: await doSave(row.no + '_' + row.serial + '.pdf', await docFile(row)) };
  } catch (e) {
    console.error(e);
    return { text: 'تعذر التصدير: ' + errMsg(e), error: true };
  }
}

export async function shareDoc(row) {
  try {
    return await shareFile(await docFile(row), msgText(typeLabel(row.type), row.no));
  } catch (e) {
    console.error(e);
    return { text: 'تعذرت المشاركة: ' + errMsg(e), error: true };
  }
}

export const waDoc = (row, cc) => openWa(row.client_phone, msgText(typeLabel(row.type), row.no), cc);

export function sendOpts(row) {
  const c = { ...row };
  delete c.org_id;
  delete c.created_by;
  return {
    title: typeLabel(row.type) + ' ' + row.no,
    text: docText(row),
    phone: row.client_phone,
    pages: () => docCanvases(row),
    json: 'بيانات مستند من أداة بوينت أب:\n' + JSON.stringify(c),
  };
}
