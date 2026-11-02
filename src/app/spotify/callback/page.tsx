import { Suspense } from 'react';
import { SpotifyCallback } from '@/components/spotify/SpotifyCallback';

export default function SpotifyCallbackPage() {
  return (
    <Suspense>
      <SpotifyCallback />
    </Suspense>
  );
}
