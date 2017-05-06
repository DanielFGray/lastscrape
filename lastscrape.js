#!/usr/bin/env node
const fs = require('fs')
const { Observable } = require('rxjs')
const { get } = require('superagent')
const commander = require('commander')
const { memoize, merge } = require('ramda')

commander
  .option('-u, --user [string]', 'Last.fm username')
  .parse(process.argv)

const query = {
  api_key: 'e38cc7822bd7476fe4083e36ee69748e',
  format: 'json',
  limit: 200,
}

const lastfm = opts =>
  Observable.from(get('http://ws.audioscrobbler.com/2.0/')
    .query(merge(query, opts)))
    .map(x => x.body)

const requestUserTracks = ({ page }) => {
  process.stderr.write(`fetching page ${page}\r`)
  return lastfm({
    method: 'user.getrecenttracks',
    user: commander.user,
    page,
  })
}

const genreOf = memoize(([ artist, album ]) =>
  lastfm({
    method: 'album.gettoptags',
    artist,
    album,
  }))

const albumOf = memoize(([ artist, track ]) =>
  lastfm({
    method: 'track.getinfo',
    artist,
    track,
  }))

const requestAllTracks = opts =>
  Observable.defer(() => requestUserTracks(opts)
    .flatMap((x) => {
      const current = Number(x.recenttracks['@attr'].page)
      const total = Number(x.recenttracks['@attr'].totalPages)
      const items$ = Observable.of(x)
      const next$ =
        1 + current <= total
        ? requestAllTracks({ page: 1 + current }) :
        Observable.empty()
      return Observable.concat(items$, next$)
    }))

const track$ = requestAllTracks({ page: 1 })
  .map(x => x.recenttracks)
  .flatMap(x => x.track)
  .map(x => ({
    date: x.date ? x.date.uts : '',
    artist: x.artist['#text'],
    name: x.name,
    album: x.album['#text'],
  }))

  .flatMap(x =>
    x.album === '[unknown]' || x.album === ''
    ? albumOf([ x.artist, x.title ])
        .map(t => merge(x, { album: t.track.album.title }))
    : Observable.of(x))

  .flatMap(x =>
    genreOf([ x.artist, x.album ])
      .map(t => t.toptags.tag.slice(0, 3).map(e => e.name))
      .map(t => merge(x, { genres: t.join(',') })))

const file = fs.createWriteStream('rx_stream.csv')

const write$ = track$
  .map(x => `${Object.values(x).join('\t')}\n`)
  // .do(x => process.stdout.write(x))
  .do(x => file.write(x))

// Observable.merge(write$)
  .subscribe(undefined, console.log)
