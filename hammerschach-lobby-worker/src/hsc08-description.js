export function validateDescription(input) {
  let description = String(input.description || '').trim();
  let descriptionRich;
  if (input.descriptionRich !== undefined) {
    if (!Array.isArray(input.descriptionRich) || input.descriptionRich.length > 4000) throw new Error('Die Ausschreibung enthält zu viele Formatierungen.');
    let length = 0;
    descriptionRich = input.descriptionRich.map(run => {
      if(run && Array.isArray(run.table)) {
        if(!run.table.length || run.table.length>100) throw new Error('Ungültige Tabellenhöhe.');
        const width=run.table[0]?.length;
        if(!width || width>12) throw new Error('Maximal 12 Tabellenspalten.');
        const table=run.table.map(row=>{if(!Array.isArray(row)||row.length!==width||row.some(cell=>typeof cell!=='string'))throw new Error('Ungültige Tabellenzellen.');length+=row.reduce((n,cell)=>n+cell.length,0);return [...row];});
        if(length>20000)throw new Error('Die Ausschreibung ist zu lang (maximal 20.000 Zeichen).');
        return {table};
      }
      if (!run || typeof run.text !== 'string' || ![14,18,24,30].includes(run.size) || typeof run.bold !== 'boolean' || typeof run.italic !== 'boolean') throw new Error('Ungültige Textformatierung.');
      length += run.text.length;
      if (length > 20000) throw new Error('Die Ausschreibung ist zu lang (maximal 20.000 Zeichen).');
      return {text:run.text, size:run.size, bold:run.bold, italic:run.italic};
    });
    description = descriptionRich.map(run=>run.table ? '\n'+run.table.map(row=>row.join(' | ')).join('\n')+'\n' : run.text).join('');
  }
  if (description.length > 20000) throw new Error('Die Ausschreibung ist zu lang (maximal 20.000 Zeichen).');
  return {description,...(descriptionRich!==undefined?{descriptionRich}:{})};
}
