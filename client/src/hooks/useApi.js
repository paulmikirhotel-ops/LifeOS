import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

export function useApi(endpoint, options = {}) {
  const [data, setData] = useState(options.initialData || null);
  const [loading, setLoading] = useState(!options.manual);
  const [error, setError] = useState(null);

  const deps = JSON.stringify(options.deps || []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(endpoint);
      if (response.success) {
        setData(response.data);
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    if (!options.manual) {
      fetchData();
    }
  }, [fetchData, deps]);

  return { data, loading, error, reload: fetchData, setData };
}
