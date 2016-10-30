nodebb-plugin-import-phpbb
==========================

Fork to use with [advanced BBCode to Markdown processor](https://github.com/elelel/phpbb3bbcode2markdown4nodebb)

*Features:*
* Imports user avatars, both from uploaded avatar images and URLs

*Usage:*
Use with nodebb-import-phpbb plugin (e.g. use git path to install the phpbb import module)

To specify PhpBB avatars upload directory in "Exporter specific configs" use *phpbbAvatarsUploadPath* setting, e.g.
 > {"phpbbAvatarsUploadPath": "/path/to/avatars/upload" }

______________________________________________________

 **Original desription**

A phpBB2 to NodeBB exporter based on nodebb-plugin-import-ubb by Aziz Khoury

Use this to import data into NodeBB using [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import).

Have a look at the original [UBB](https://github.com/akhoury/nodebb-plugin-import-ubb) migrator for detailed instructions on how to use this importer.

You may want to check out the [bbcode-to-markdown](https://github.com/psychobunny/nodebb-plugin-bbcode-to-markdown) plugin as well.
