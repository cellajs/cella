import { useEffect, useState } from 'react';
import zxcvbn from 'zxcvbn';

interface PasswordStrengthProps {
  className?: string;
  password: string;
  userInputs?: string[];
  barColors?: string[];
  minLength?: number;
}

const PasswordStrength = ({
  password,
  userInputs = [],
  barColors = ['#cccccc30', '#ef4836', '#f6b44d', '#2b90ef', '#25c281'],
  minLength = 4,
}: PasswordStrengthProps) => {
  const [score, setScore] = useState(0);

  useEffect(() => {
    const result = zxcvbn(password, userInputs);
    setScore(result.score);
  }, [password]);

  return (
    <div className={`absolute -mt-[calc(0.25rem+1px)] w-full px-[1px] flex gap-[1px] ${password.length > minLength ? '' : 'opacity-50'}`}>
      {[1, 2, 3, 4].map((el) => (
        <div
          className="h-1 w-full bg-primary/25"
          key={`password-strength-bar-item-${el}`}
          style={{
            borderBottomLeftRadius: el === 1 ? '0.5rem' : 0,
            borderBottomRightRadius: el === 4 ? '0.5rem' : 0,
            backgroundColor: score >= el ? barColors[score] : barColors[0],
          }}
        />
      ))}
    </div>
  );
};

export default PasswordStrength;
