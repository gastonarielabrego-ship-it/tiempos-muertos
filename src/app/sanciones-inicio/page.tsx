import { Suspense } from 'react';
import SancionInicioForm from './sancion-inicio-form';
export const dynamic = 'force-dynamic';
export default function SancionInicioPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <SancionInicioForm />
    </Suspense>
  );
}
