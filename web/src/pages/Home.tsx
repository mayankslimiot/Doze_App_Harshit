import { Button } from '@/components/ui/Button';
import { useStore } from '@/store/useStore';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export default function Home() {
  const { count, increment, decrement, reset } = useStore();
  const [name, setName] = useLocalStorage<string>('app-name', 'Doze App');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">
          Welcome to {name}
        </h1>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Update App Name (persists in localStorage)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        <div className="bg-gray-100 rounded-lg p-6 mb-6">
          <p className="text-center text-gray-600 mb-4">Zustand Store Count</p>
          <div className="flex items-center justify-center space-x-4">
            <Button variant="outline" onClick={decrement}>
              -
            </Button>
            <span className="text-2xl font-bold w-12 text-center">{count}</span>
            <Button variant="outline" onClick={increment}>
              +
            </Button>
          </div>
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" onClick={reset}>
              Reset Count
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <Button className="w-full" variant="default">
            Primary Action
          </Button>
          <Button className="w-full" variant="destructive" isLoading>
            Destructive Action
          </Button>
        </div>
      </div>
    </div>
  );
}
