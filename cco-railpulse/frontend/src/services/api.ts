const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export class ApiService {
  static async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
    return response.json();
  }

  static async post<T>(endpoint: string, body: any, customHeaders?: HeadersInit): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        ...customHeaders 
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
    return response.json();
  }
}