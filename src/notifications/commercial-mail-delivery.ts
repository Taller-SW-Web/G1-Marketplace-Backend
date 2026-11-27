import { EmailConfiguration, EmailSnapshot, renderTransactionalEmail } from './email-template';

type RenderedMail = ReturnType<typeof renderTransactionalEmail>;
export type CommercialMailMessage = Pick<RenderedMail, 'subject' | 'html' | 'text'> & { to: string };

export interface CommercialMailTransport {
  send(message: CommercialMailMessage): Promise<{ messageId: string; httpStatus: number }>;
}

/**
 * The caller supplies an authorized snapshot of the same order from Sales.
 * The renderer validates PAGADO. H-05 triggers delivery at DESPACHADO.
 */
export async function deliverCommercialMail(
  snapshot: EmailSnapshot,
  to: string,
  config: EmailConfiguration,
  transport: CommercialMailTransport,
) {
  if (snapshot.type === 'SHIPMENT_UPDATE' && snapshot.state !== 'DESPACHADO') {
    return { status: 'skipped' } as const;
  }
  const { subject, html, text, payloadVersion } = renderTransactionalEmail(snapshot, config);
  const receipt = await transport.send({ to, subject, html, text });
  return { status: 'accepted', ...receipt, payloadVersion } as const;
}
