export async function writeCommand(endpoint, fields, request = fetch) {
  const response = await request(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!response.ok) throw new Error(`COMMAND_REJECTED_${response.status}`);
  const document = await response.json();
  if (typeof document.name !== 'string' || !document.name.includes('/documents/CommandQueue/')) {
    throw new Error('COMMAND_WRITE_NOT_CONFIRMED');
  }
  return { id: document.name.split('/').pop(), status: 'pending' };
}
