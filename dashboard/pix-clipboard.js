// The clipboard request must start inside the tap event on iOS, before the network awaits.
export async function copyPaymentPix({load, current, clipboard, ClipboardItem}) {
  if (!clipboard?.writeText && !(clipboard?.write && ClipboardItem)) {
    throw Error('Abra o painel em um navegador com permissão para copiar.');
  }
  const key = load().then(value => {
    if (!current()) throw Error('A sessão mudou. Abra o RH novamente.');
    return value;
  });
  if (clipboard.write && ClipboardItem) {
    const content = key.then(value => new Blob([value], {type:'text/plain'}));
    // A browser may decline clipboard permission without consuming the deferred value.
    content.catch(() => {});
    await clipboard.write([new ClipboardItem({'text/plain':content})]);
  } else {
    await clipboard.writeText(await key);
  }
}
