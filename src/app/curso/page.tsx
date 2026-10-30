import { CourseView } from '@/components/course/CourseView';
import { TopBar } from '@/components/TopBar';
import { t } from '@/i18n';

export default function CoursePage() {
  return (
    <main className="page">
      <TopBar title={t('course.title')} />
      <CourseView />
    </main>
  );
}
