import { useParams } from '@tanstack/react-router';
import { NftDetailPage } from '@/features/discovery/nft-detail-page';

export function NftDetailRouteView() {
  const { nftId } = useParams({ from: '/nfts/$nftId' });
  return <NftDetailPage nftId={nftId} />;
}
