import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// Interface allows future swap to PuppeteerCrawler
interface ICrawlerStrategy {
  crawl(url: string): Promise<{ title: string; content: string }>;
}

class JSDOMCrawler implements ICrawlerStrategy {
  async crawl(url: string): Promise<{ title: string; content: string }> {
    console.log(`[Crawler] Fetching (JSDOM): ${url}`);

    // 1. Fetch HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CapsulaBot/1.0; +http://capsula.ai)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();

    // 2. Parse DOM
    const dom = new JSDOM(html, { url });

    // 3. Extract Content
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      throw new Error('Readability failed to parse content');
    }

    return {
      title: article.title || 'Untitled',
      content: `Title: ${article.title}\nURL: ${url}\n\n${article.textContent}`
    };
  }
}

// Placeholder for future implementation
/*
class PuppeteerCrawler implements ICrawlerStrategy {
  async crawl(url: string) { ... }
}
*/

export class CrawlerService {
  // Configurable strategy
  private static strategy: ICrawlerStrategy = new JSDOMCrawler();

  static async crawl(url: string): Promise<{ title: string; content: string }> {
    // In future, we can switch strategy based on config or URL pattern (dynamic routing)
    return this.strategy.crawl(url);
  }
}
