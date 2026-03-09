# Changelog

## [0.5.0](https://github.com/tyevco/pulumi-homelab/compare/v0.4.0...v0.5.0) (2026-03-09)


### Features

* add extraFiles, LXC clone, NotificationSettings, and UnraidVm resources ([c329976](https://github.com/tyevco/pulumi-homelab/commit/c3299761d71fb7480c3d093674d2bf295cca36e6))
* extraFiles, LXC clone, NotificationSettings, and UnraidVm resources ([ddb20ee](https://github.com/tyevco/pulumi-homelab/commit/ddb20eee6dfa7c2d86f6e86573e12dd9cda7dadd))
* update SDK with ExtraFile, sourceContainer, NotificationSettings, UnraidVm ([cd799de](https://github.com/tyevco/pulumi-homelab/commit/cd799decb4da5951ea1d125be650e043e0a32d81))

## [0.4.0](https://github.com/tyevco/pulumi-homelab/compare/v0.3.6...v0.4.0) (2026-03-08)


### Features

* add agent endpoint routing to LXC API client ([cad01cc](https://github.com/tyevco/pulumi-homelab/commit/cad01ccefb289de3ad7e4fd1d5fd1582cf538607))
* add agent endpoint routing to LXC API client ([c72614c](https://github.com/tyevco/pulumi-homelab/commit/c72614c57555f38bb366873a72a3691bfaa89c0b))
* add listAgents client function for GET /api/agents ([de774d8](https://github.com/tyevco/pulumi-homelab/commit/de774d8cb4b1957a20bc6a0003fcf1a5815d3f82))

## [0.3.6](https://github.com/tyevco/pulumi-homelab/compare/v0.3.5...v0.3.6) (2026-03-06)


### Bug Fixes

* correct LXC API response unwrapping and add getLxcDistributions ([34bcc79](https://github.com/tyevco/pulumi-homelab/commit/34bcc79b33a23b5309cbc00b9fe49c1a0f644848))
* correct LXC API response unwrapping and add getLxcDistributions ([cba1789](https://github.com/tyevco/pulumi-homelab/commit/cba1789f39e975fdb8df30b42665614c588352c1))

## [0.3.5](https://github.com/tyevco/pulumi-homelab/compare/v0.3.4...v0.3.5) (2026-03-06)


### Bug Fixes

* omit Content-Type on GET requests and recreate stack on 404 ([c02fdfb](https://github.com/tyevco/pulumi-homelab/commit/c02fdfb76273cefd4563bb407e8995e4180a08ba))
* recreate stack on 404 during update ([eae8ca9](https://github.com/tyevco/pulumi-homelab/commit/eae8ca99f9505654ab3ee2f8be8f8d48b4d3b79b))

## [0.3.4](https://github.com/tyevco/pulumi-homelab/compare/v0.3.3...v0.3.4) (2026-03-01)


### Bug Fixes

* omit Content-Type header on GET requests to OPNsense API ([79a7175](https://github.com/tyevco/pulumi-homelab/commit/79a7175853e9f5bb9bd28f28a6ffce2ec79d19ad))
* omit Content-Type on GET requests to OPNsense API ([0bf4d44](https://github.com/tyevco/pulumi-homelab/commit/0bf4d445e3bedf18bedd28f24eb6a94ef2632c0f))

## [0.3.3](https://github.com/tyevco/pulumi-homelab/compare/v0.3.2...v0.3.3) (2026-03-01)


### Bug Fixes

* add not-found text detection to traefik static config read handler ([24e1222](https://github.com/tyevco/pulumi-homelab/commit/24e1222e4353a59f61b4cce3a3b5244c99f55607))
* add TXT to valid rr types in host override validation ([5526f3b](https://github.com/tyevco/pulumi-homelab/commit/5526f3befd237428265826057fc739b93ce74b33))
* consistent not-found detection in all read and delete handlers ([b9e9be9](https://github.com/tyevco/pulumi-homelab/commit/b9e9be9dc81b3264bdaa0d7dade7b6d831257b48))
* consistent not-found handling and test coverage improvements ([398d1af](https://github.com/tyevco/pulumi-homelab/commit/398d1af4a22ecea71cd7aabe8422b90c4ba06aa9))
* consistent not-found handling, stackToOutputs bug, and test coverage ([f26c586](https://github.com/tyevco/pulumi-homelab/commit/f26c586ddc8e264ac74fdefe11a390483447c01b))
* harden OPNsense getItem response parsing ([81b1b1c](https://github.com/tyevco/pulumi-homelab/commit/81b1b1c801b9af26326b48871de7572deee9304b))
* harden OPNsense getItem response parsing and Struct serialization ([9a93e3c](https://github.com/tyevco/pulumi-homelab/commit/9a93e3c2e8adc0cf53b4bff5df5f074c38a899d6))
* make OPNsense delete handlers match read handlers for not-found detection ([52c60e9](https://github.com/tyevco/pulumi-homelab/commit/52c60e98f789a53d9ad482b5005f4bf657b89b78))
* use strict undefined checks in stackToOutputs for envFile and composeYaml ([7533718](https://github.com/tyevco/pulumi-homelab/commit/7533718227f750fa734933715f108a46510e0fbb))

## [0.3.2](https://github.com/tyevco/pulumi-homelab/compare/v0.3.1...v0.3.2) (2026-03-01)


### Bug Fixes

* add enum validation to check handlers ([413ff1b](https://github.com/tyevco/pulumi-homelab/commit/413ff1bf7a45848a45c58e2c46a654321eeeff50))
* code analysis round 4 - enum validation, autostart fix, test coverage ([d51ab45](https://github.com/tyevco/pulumi-homelab/commit/d51ab452d64a2680df957f7c81886005610b6570))
* move lxcContainer autostart to REPLACE_FIELDS ([7e51e66](https://github.com/tyevco/pulumi-homelab/commit/7e51e66bede034ac2e91927a38bbd62f54e94804))

## [0.3.1](https://github.com/tyevco/pulumi-homelab/compare/v0.3.0...v0.3.1) (2026-03-01)


### Bug Fixes

* normalize OPNsense getItem response format for read/import ([9f2f180](https://github.com/tyevco/pulumi-homelab/commit/9f2f18084d9c816fa27bb0cd74cccfa397200706))
* OPNsense API normalization, diff stability, and edge cases ([fbfb0c4](https://github.com/tyevco/pulumi-homelab/commit/fbfb0c4c40e8cc8bd840d35e3eced9013e972a86))
* prevent spurious diffs between undefined and empty string ([155b14b](https://github.com/tyevco/pulumi-homelab/commit/155b14b754910bdd27d4206f5110d04c49ac4d4b))
* use nullish coalescing for opnsenseInsecure config ([6a15806](https://github.com/tyevco/pulumi-homelab/commit/6a158063a9c88a368f599aab62e262129b7cf765))
* use safeParseInt to prevent NaN from empty/invalid numeric strings ([e6bcc78](https://github.com/tyevco/pulumi-homelab/commit/e6bcc78715e73728a7e9b5f03efb3613037ba931))

## [0.3.0](https://github.com/tyevco/pulumi-homelab/compare/v0.2.3...v0.3.0) (2026-03-01)


### ⚠ BREAKING CHANGES

* Remove all dockge backward-compat aliases and rename client module. DockgeStack, DockgeStackArgs, DockgeContainerInfo, DockgeClientConfig, DockgeStackInfo, and configureDockgeClient exports are removed. The dockge:index:DockgeStack resource type is no longer supported. Config keys dockge:config:url and dockge:config:apiKey are removed. Use homelab:config:url and homelab:config:apiKey instead.

### Features

* add LXC container resource ([2cdb2f4](https://github.com/tyevco/pulumi-homelab/commit/2cdb2f495c9ae9b72bd1afd4cde3acefeb8eb71a))
* add mac as supported alias type for OpnsenseAlias ([7e87616](https://github.com/tyevco/pulumi-homelab/commit/7e87616958bb6f385d3c2c584499ddeff3af66a9))
* add mac as supported alias type for OpnsenseAlias ([2ebbbde](https://github.com/tyevco/pulumi-homelab/commit/2ebbbde093eb9e1d81dddc7b8c64f679a85546ea))
* remove dockge backward compatibility and rename to homelab ([1b2c921](https://github.com/tyevco/pulumi-homelab/commit/1b2c921261742350d799470678e871be0122f9c4))


### Bug Fixes

* add docker-compose keyword to schema ([da87af7](https://github.com/tyevco/pulumi-homelab/commit/da87af7bc4338baa8056688a49d2e58eb4da8d78))
* add json.message support to homelabClient error extraction ([2a1b58c](https://github.com/tyevco/pulumi-homelab/commit/2a1b58c42c793a46c2ac0ffc0bd5b1e1f049d0b4))
* code analysis bug fixes and edge case tests ([5731b29](https://github.com/tyevco/pulumi-homelab/commit/5731b29a4f06e544d4e25751f7abcf863ac25fb7))
* code analysis round 2 - error handling and test coverage ([c055400](https://github.com/tyevco/pulumi-homelab/commit/c05540077fefdc05dfa1732853398587efb8c729))
* stop LXC container before deleting to prevent deletion failures ([7699b9f](https://github.com/tyevco/pulumi-homelab/commit/7699b9ff9f6b68d55ea0b1ec21817f4606d41ab9))
* unwrap secrets inside arrays recursively ([fd5267a](https://github.com/tyevco/pulumi-homelab/commit/fd5267aecc21ca99fdbd0e7fc0dec0dab3be8ba1))

## [0.2.3](https://github.com/tyevco/pulumi-homelab/compare/v0.2.2...v0.2.3) (2026-03-01)


### Bug Fixes

* use gh release upload instead of softprops/action-gh-release ([7826a40](https://github.com/tyevco/pulumi-homelab/commit/7826a40609f177d2616a60ee18b00db3c6425a42))

## [0.2.2](https://github.com/tyevco/pulumi-homelab/compare/v0.2.1...v0.2.2) (2026-02-28)


### Bug Fixes

* release-please tag matching, CI tests, and publish workflow ([7ee9ef5](https://github.com/tyevco/pulumi-homelab/commit/7ee9ef5846680a78fd08cdd15cfecba7011fd001))
* run publish steps directly in release-please workflow ([e10ec90](https://github.com/tyevco/pulumi-homelab/commit/e10ec9077dd36ea57e91a5cfe1b21bd67049ffe4))

## [0.2.1](https://github.com/tyevco/pulumi-homelab/compare/v0.2.0...v0.2.1) (2026-02-28)


### Bug Fixes

* convert jest config from TypeScript to JavaScript ([7d2e68f](https://github.com/tyevco/pulumi-homelab/commit/7d2e68f1a281535f8e729ad7d4846f5779cca413))
* release-please tag matching and CI test runner ([c103565](https://github.com/tyevco/pulumi-homelab/commit/c103565c9c7faeb87ae28bf0b3c82412563f461b))
* resolve hardcoded version, unhandled promise rejections, and dead code ([2bef660](https://github.com/tyevco/pulumi-homelab/commit/2bef660c6c1c06824adc4ba77aaca68c0a5fd7f1))
* sync versions to v0.2.0, add tests to CI, remove dead code ([9192ae9](https://github.com/tyevco/pulumi-homelab/commit/9192ae9d2e43c1389ca5905b54c2ca7bfcc7efe2))
* use plain v* tags and sync package-lock version ([3f74b68](https://github.com/tyevco/pulumi-homelab/commit/3f74b687ccfa6d77df20af7f5bc5f853389226bd))
