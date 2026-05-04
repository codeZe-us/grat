/**
 * Grat SDK
 */

export class GratClient {
  constructor(private readonly baseUrl: string) {}

  async getHealth(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }
}
