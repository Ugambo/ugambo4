import { DriverReview } from './driver-review';

export default async function DriverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DriverReview driverId={id} />;
}
