import test from 'node:test';import assert from 'node:assert/strict';import {restoreBackup,exportHtml} from '../src/hsc08-backup.js';import {validateHsc08Draft} from '../src/hsc08.js';import {hsc08Page} from '../src/hsc08-page.js';
const t={title:'<img src=x onerror=alert(1)>',mode:'round-robin',participants:[],phase:'draft',description:'<script>alert(1)</script>'};
test('backup import validates version, structure and strips unrelated keys',()=>{
 const backup={format:'HSC08-Turniersicherung',version:1,draft:{...t,password:'secret',isAdmin:true},view:t};
 const result=restoreBackup(backup,validateHsc08Draft);assert.ok(!('password' in result.draft));assert.ok(!('isAdmin' in result.draft));
 for(const patch of [{version:2},{draft:null},{draft:{...t,phase:'running',schedule:[]}},{draft:{...t,audit:[{action:'injected'}]}}])assert.throws(()=>restoreBackup({...backup,...patch},validateHsc08Draft));
 const html=exportHtml(t);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('data:image/jpeg'));
});
test('embedded browser script remains syntactically valid',()=>{const html=hsc08Page();new Function(html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>')));});
test('backup keeps an unpublished draft separate from the adopted view',()=>{
 const backup={format:'HSC08-Turniersicherung',version:1,draft:{...t,title:'Neuer Entwurf'},view:{...t,title:'Sichtbarer Stand'}};
 const restored=restoreBackup(backup,validateHsc08Draft);
 assert.equal(restored.draft.title,'Neuer Entwurf');assert.equal(restored.view.title,'Sichtbarer Stand');
 assert.ok(!exportHtml(restored.view).includes('Neuer Entwurf'));
 const unpublished=restoreBackup({...backup,view:null},validateHsc08Draft);assert.equal(unpublished.view,null);
});
