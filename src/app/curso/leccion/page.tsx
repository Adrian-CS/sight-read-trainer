import { Suspense } from 'react';
import { LessonView } from '@/components/course/LessonView';

// Ruta estática con ?pista=…
export default function LessonPage() {
  return (
    <Suspense>
      <LessonView />
    </Suspense>
  );
}
