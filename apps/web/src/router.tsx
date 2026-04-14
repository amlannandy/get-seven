import { createBrowserRouter } from 'react-router-dom';
import HomePage from './pages/HomePage';
import JoinPage from './pages/JoinPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/join/:code',
    element: <JoinPage />,
  },
  {
    path: '/lobby/:roomId',
    element: <LobbyPage />,
  },
  {
    path: '/game/:roomId',
    element: <GamePage />,
  },
]);
