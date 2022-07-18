import { Post, MobileDoc } from "./ghost";

export class GhostAdmin {
  private token?: string;

  constructor(private url: string, private key: string) { }

  async init() {
    const [id, secret] = this.key.split(":");

    this.token = await self.syscall(
      "jwt.jwt",
      secret,
      id,
      "HS256",
      "5m",
      "/v3/admin/"
    );
  }

  async listPosts(): Promise<Post[]> {
    let result = await fetch(
      `${this.url}/ghost/api/v3/admin/posts?order=published_at+DESC`,
      {
        headers: {
          Authorization: `Ghost ${this.token}`,
        },
      }
    );

    return (await result.json()).posts;
  }

  async listMarkdownPosts(): Promise<Post[]> {
    let markdownPosts: Post[] = [];
    for (let post of await this.listPosts()) {
      let mobileDoc = JSON.parse(post.mobiledoc) as MobileDoc;
      if (mobileDoc.cards.length > 0 && mobileDoc.cards[0][0] === "markdown") {
        markdownPosts.push(post);
      }
    }
    return markdownPosts;
  }

  publishPost(post: Partial<Post>): Promise<any> {
    return this.publish("posts", post);
  }

  publishPage(post: Partial<Post>): Promise<any> {
    return this.publish("pages", post);
  }

  async publish(what: "pages" | "posts", post: Partial<Post>): Promise<any> {
    let oldPostQueryR = await fetch(
      `${this.url}/ghost/api/v3/admin/${what}/slug/${post.slug}`,
      {
        headers: {
          Authorization: `Ghost ${this.token}`,
          "Content-Type": "application/json",
        },
      }
    );
    let oldPostQuery = await oldPostQueryR.json();
    if (!oldPostQuery[what]) {
      // New!
      if (!post.status) {
        post.status = "draft";
      }
      let result = await fetch(`${this.url}/ghost/api/v3/admin/${what}`, {
        method: "POST",
        headers: {
          Authorization: `Ghost ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [what]: [post],
        }),
      });
      return (await result.json())[what][0];
    } else {
      let oldPost: Post = oldPostQuery[what][0];
      post.updated_at = oldPost.updated_at;
      let result = await fetch(
        `${this.url}/ghost/api/v3/admin/${what}/${oldPost.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Ghost ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            [what]: [post],
          }),
        }
      );
      return (await result.json())[what][0];
    }
  }
}
