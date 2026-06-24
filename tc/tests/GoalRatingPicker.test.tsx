// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ReadAloudButton pulls in next-intl, the auth context, and the speech-synthesis
// hook — none of which is the behaviour under test. Stub it to a no-op so the
// rating control renders in isolation, with no providers to set up.
vi.mock('@/components/feedback/ReadAloudButton', () => ({
  ReadAloudButton: () => null
}));

import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';

afterEach(cleanup);

const baseProps = {
  ariaLabel: 'Rate: walk further',
  goalText: 'Walk further without my stick',
  question: 'How far could you walk this week?',
  direction: 'higherIsBetter' as const,
  value: undefined as number | undefined,
  onChange: () => {}
};

describe('GoalRatingPicker', () => {
  it('renders an 11-button (0–10) radiogroup', () => {
    render(<GoalRatingPicker {...baseProps} />);
    expect(
      screen.getByRole('radiogroup', { name: baseProps.ariaLabel })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(11);
  });

  it('calls onChange once with the tapped number', () => {
    const onChange = vi.fn();
    render(<GoalRatingPicker {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: '7' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('marks exactly one button — the current value — as checked', () => {
    render(<GoalRatingPicker {...baseProps} value={4} />);
    const checked = screen
      .getAllByRole('radio')
      .filter((b) => b.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName('4');
  });

  it('shows the "tap a number" prompt only until a value is picked', () => {
    const { rerender } = render(
      <GoalRatingPicker {...baseProps} value={undefined} />
    );
    expect(screen.getByText(/tap a number/i)).toBeInTheDocument();
    rerender(<GoalRatingPicker {...baseProps} value={6} />);
    expect(screen.queryByText(/tap a number/i)).not.toBeInTheDocument();
  });

  it('anchors endpoint meaning to direction — higherIsBetter: 0 = Worst, 10 = Best', () => {
    render(<GoalRatingPicker {...baseProps} direction="higherIsBetter" />);
    expect(screen.getByRole('radio', { name: '0, Worst' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10, Best' })).toBeInTheDocument();
  });

  it('flips endpoint meaning for lowerIsBetter — 0 = Best, 10 = Worst', () => {
    render(<GoalRatingPicker {...baseProps} direction="lowerIsBetter" />);
    expect(screen.getByRole('radio', { name: '0, Best' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10, Worst' })).toBeInTheDocument();
  });
});
