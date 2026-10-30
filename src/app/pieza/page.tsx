import { Suspense } from 'react';
import { PieceView } from '@/components/PieceView';

// Ruta estática con ?id=…: las piezas viven en IndexedDB, no se conocen al compilar.
export default function PiecePage() {
  return (
    <Suspense>
      <PieceView />
    </Suspense>
  );
}
