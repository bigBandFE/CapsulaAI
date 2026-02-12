
export class Sanitizer {
  public static readonly PLACEHOLDER_PREFIX = 'CAPSULA_PII_';

  /**
   * Detects and replaces sensitive PII in the text.
   * Returns the sanitized text and a map to restore the original data.
   */
  static sanitize(text: string): { sanitized: string; map: Record<string, string> } {
    const map: Record<string, string> = {};
    let counter = 1;

    let sanitized = text;

    // Regex patterns for common PII (Simplified for demo)
    // In production, use a library like google-libphonenumber or specialized PII models
    const patterns = [
      { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
      { type: 'PHONE', regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g },
      { type: 'ID', regex: /\b\d{15,18}\b/g } // Rough ID number match
    ];

    patterns.forEach(item => {
      sanitized = sanitized.replace(item.regex, (match) => {
        // Check if we already mapped this specific match to keep consistency
        const existingKey = Object.keys(map).find(key => map[key] === match);
        if (existingKey) return existingKey;

        const key = `${this.PLACEHOLDER_PREFIX}${item.type}_${counter++}`;
        map[key] = match;
        return key;
      });
    });

    return { sanitized, map };
  }

  /**
   * Restores the original data into the JSON result.
   * Traverses the JSON and replaces placeholders back to original values.
   */
  static restore(data: any, map: Record<string, string>): any {
    if (!data) return data;

    if (typeof data === 'string') {
      let restored = data;
      Object.keys(map).forEach(key => {
        restored = restored.replace(new RegExp(key, 'g'), map[key]);
      });
      return restored;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.restore(item, map));
    }

    if (typeof data === 'object') {
      const result: any = {};
      for (const key in data) {
        result[key] = this.restore(data[key], map);
      }
      return result;
    }

    return data;
  }
}
