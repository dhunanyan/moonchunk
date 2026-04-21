<!doctype html>
<html lang="{{ lang }}" dir="{{ dir }}" class="{{ htmlClass }}">
  <head>
    <meta charset="{{ charset }}" />
    <meta name="viewport" content="{{ viewport }}" />

    <title>{{ title }}</title>

    <meta name="description" content="{{ metaDescription }}" />
    <meta name="keywords" content="{{ metaKeywords }}" />
    <meta name="author" content="{{ metaAuthor }}" />
    <meta name="robots" content="{{ metaRobots }}" />
    <meta name="theme-color" content="{{ themeColor }}" />

    <link rel="canonical" href="{{ canonicalUrl }}" />
    <link rel="icon" href="{{ faviconHref }}" />
    <link rel="apple-touch-icon" href="{{ appleTouchIconHref }}" />
    <link rel="manifest" href="{{ manifestHref }}" />

    <meta property="og:type" content="{{ ogType }}" />
    <meta property="og:title" content="{{ ogTitle }}" />
    <meta property="og:description" content="{{ ogDescription }}" />
    <meta property="og:image" content="{{ ogImage }}" />
    <meta property="og:url" content="{{ ogUrl }}" />
    <meta property="og:site_name" content="{{ ogSiteName }}" />
    <meta property="og:locale" content="{{ ogLocale }}" />

    <meta name="twitter:card" content="{{ twitterCard }}" />
    <meta name="twitter:site" content="{{ twitterSite }}" />
    <meta name="twitter:creator" content="{{ twitterCreator }}" />
    <meta name="twitter:title" content="{{ twitterTitle }}" />
    <meta name="twitter:description" content="{{ twitterDescription }}" />
    <meta name="twitter:image" content="{{ twitterImage }}" />

    {{ preloadLinks }}
    {{ preconnectLinks }}
    {{ styles }}
    {{ headScripts }}
    {{ headExtra }}
  </head>
  <body class="{{ bodyClass }}" data-page="{{ pageId }}">
    {{ topBar }}
    {{ header }}

    <main id="main" role="main">
      {{ content }}
    </main>

    {{ footer }}
    {{ modals }}
    {{ scripts }}
    {{ bodyEndExtra }}
  </body>
</html>
