import { render, screen } from '@testing-library/react';
import App from './App';

test('renders sign in screen', () => {
  render(<App />);
  const signInElement = screen.getByText(/sign in/i);
  expect(signInElement).toBeInTheDocument();
});
