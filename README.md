# Ghost plug for Silver Bullet

Note: Still very basic, to use:

Create a page `ghost-config` in your space with the following configuration:

        ```meta
        url: https://your-ghost-blog.ghost.io
        adminKey: your:adminkey
        postPrefix: posts
        pagePrefix: pages
        ```

This will assume the naming pattern of `posts/my-post-slug` where the first top-level heading (`# Hello`) will be used as the post title.

Commands to use `Ghost: Publish`