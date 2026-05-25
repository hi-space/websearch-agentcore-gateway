interface OnEventInput {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: { gatewayId: string };
}

export const handler = async (event: OnEventInput) => {
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }
  const gatewayId = event.ResourceProperties.gatewayId;
  return {
    PhysicalResourceId: `wait-${gatewayId}`,
    Data: { gatewayId }
  };
};
