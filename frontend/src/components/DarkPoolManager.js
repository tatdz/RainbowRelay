import React, { useState } from 'react';
import { joinPool } from '../api';

const DarkPoolManager = ({ peerId }) => {
  const [poolName, setPoolName] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleJoinPool = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await joinPool(poolName, peerId);
      if (result.success) {
        alert(`Joined ${poolName}`);
      } else {
        setError('Failed to join pool');
      }
    } catch (err) {
      setError(err.message || 'Failed to join pool');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2>Join Dark Pool</h2>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleJoinPool}>
        <input
          type="text"
          placeholder="Pool Name"
          value={poolName}
          onChange={(e) => setPoolName(e.target.value)}
          required
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Joining...' : 'Join Pool'}
        </button>
      </form>
    </div>
  );
};

export default DarkPoolManager;