#!/usr/bin/env node
const fs = require('fs')
const { Observable } = require('rxjs')
const { get } = require('superagent')
const commander = require('commander')
const {
  memoize,
  merge,
  replace,
} = require('ramda')

const term = require('terminal-kit').terminal

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const stripDots = replace(/\./g, '')

commander
  .option('-u, --user <string>', 'Last.fm username')
  .parse(process.argv)

if (! has(commander, 'user')) {
  term.red('must specify last.fm username with -u or --user\n')
  process.exit(1)
}

const query = {
  api_key: 'e38cc7822bd7476fe4083e36ee69748e',
  format: 'json',
  limit: 200,
}

const progressBar = term.progressBar({
  width: process.env.COLUMNS,
  eta: true,
  percent: true,
  titleSize: '50%',
})

const lastfm = opts =>
  Observable.from(get('http://ws.audioscrobbler.com/2.0/')
    .query(merge(query, opts)))
    .map(x => x.body)

const requestUserTracks = ({ page }) => {
  progressBar.update({ title: `fetching page ${page}` })
  return lastfm({
    method: 'user.getrecenttracks',
    user: commander.user,
    page,
  })
}

const genreOf = memoize(([ artist, album ]) => {
  progressBar.update({ title: `fetching genre for ${artist} - ${album}` })
  if (! album) {
    return lastfm({
      method: 'artist.gettoptags',
      artist: stripDots(artist),
    })
  }
  return lastfm({
    method: 'album.gettoptags',
    artist: stripDots(artist),
    album: stripDots(album),
  })
})

const albumOf = memoize(([ artist, track ]) => {
  progressBar.update({ title: `fetching album for ${artist} - ${track}` })
  return lastfm({
    method: 'track.getinfo',
    artist: stripDots(artist),
    track: stripDots(track),
  })
})

const file = fs.createWriteStream('rx_stream.csv')

const requestAllTracks = opts =>
  Observable.defer(() => requestUserTracks(opts)
    .flatMap((x) => {
      const current = Number(x.recenttracks['@attr'].page)
      const total = Number(x.recenttracks['@attr'].totalPages)
      progressBar.update({ progress: current / total })
      const items$ = Observable.of(x)
      const next$ =
        1 + current < total
        ? requestAllTracks({ page: 1 + current })
        : Observable.empty()
      return Observable.concat(items$, next$)
    }))

requestAllTracks({ page: 1 })
  .map(x => x.recenttracks)
  .flatMap(x => x.track)
  .filter(x => typeof x.date !== 'undefined')
  .map(({ date, artist, name, album }) => ({
    date: date.uts,
    artist: artist['#text'],
    title: name,
    album: album['#text'],
  }))

  .flatMap(x => (
    x.album === '[unknown]' || x.album === ''
    ? albumOf([ x.artist, x.title ])
        .map(t => (
          ! has(t, 'error') && has(t.track, 'album')
          ? merge(x, { album: t.track.album.title })
          : x))
    : Observable.of(x)))

  .flatMap(x =>
    genreOf([ x.artist, x.album ])
      .map(t =>
        ! has(t, 'error') && has(t.toptags, 'tag')
        ? merge(x, { genres: t.toptags.tag.slice(0, 3).map(e => e.name) })
        : x))

  .map(x => `${Object.values(x).join('\t')}\n`)
  .do(x => file.write(x))
  .subscribe()
