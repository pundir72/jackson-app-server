# Game API Documentation

## Overview

The Game API provides comprehensive functionality for managing games in the rewards backend system. Games can be categorized, rated, and offer various rewards to users.

## Game Model

### Schema Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | String | Yes | Game title (max 255 chars) |
| `description` | String | Yes | Game description |
| `category` | String | Yes | Game category (enum) |
| `difficulty` | String | No | Game difficulty level |
| `gameType` | String | No | Type of game |
| `pointsReward` | Number | Yes | Points awarded for playing |
| `cashbackReward` | Number | Yes | Cashback amount awarded |
| `maxPointsPerDay` | Number | No | Daily points limit |
| `maxCashbackPerDay` | Number | No | Daily cashback limit |
| `gameUrl` | String | No | External game URL |
| `gameData` | Mixed | No | Game-specific configuration |
| `rules` | Mixed | No | Game rules and instructions |
| `requirements` | Mixed | No | Game requirements |
| `imageUrl` | String | No | Game image URL |
| `iconName` | String | No | Game icon name |
| `backgroundColor` | String | No | Background color (hex) |
| `textColor` | String | No | Text color (hex) |
| `isActive` | Boolean | No | Game availability status |
| `isFeatured` | Boolean | No | Featured game status |
| `isNew` | Boolean | No | New game status |
| `isVipOnly` | Boolean | No | VIP-only game status |
| `minLevel` | Number | No | Minimum user level required |
| `maxPlayers` | Number | No | Maximum players for multiplayer |
| `estimatedDuration` | Number | No | Estimated game duration (minutes) |
| `tags` | [String] | No | Game tags for filtering |
| `ageRange` | String | No | Target age range |
| `gender` | String | No | Target gender |
| `locationRequired` | Boolean | No | Location requirement |
| `locationRadius` | Number | No | Location radius (km) |
| `totalPlays` | Number | No | Total game plays |
| `totalPointsAwarded` | Number | No | Total points awarded |
| `totalCashbackAwarded` | Number | No | Total cashback awarded |
| `averageRating` | Number | No | Average user rating |
| `totalRatings` | Number | No | Total number of ratings |

### Enums

#### Category
- `puzzle` - Puzzle games
- `strategy` - Strategy games
- `action` - Action games
- `arcade` - Arcade games
- `educational` - Educational games
- `casino` - Casino games
- `trivia` - Trivia games
- `simulation` - Simulation games

#### Difficulty
- `easy` - Easy difficulty
- `medium` - Medium difficulty
- `hard` - Hard difficulty
- `expert` - Expert difficulty

#### Game Type
- `single_player` - Single player games
- `multiplayer` - Multiplayer games
- `tournament` - Tournament games
- `challenge` - Challenge games

#### Age Range
- `all` - All ages
- `under_18` - Under 18
- `18_24` - 18-24 years
- `25_34` - 25-34 years
- `35_44` - 35-44 years
- `45_54` - 45-54 years
- `55_plus` - 55+ years

#### Gender
- `all` - All genders
- `male` - Male
- `female` - Female
- `other` - Other

### Virtual Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalRewardValue` | Number | Combined reward value (points + cashback equivalent) |
| `popularityScore` | Number | Calculated popularity score |
| `isLocationBased` | Boolean | Whether game requires location |
| `hasDailyLimits` | Boolean | Whether game has daily limits |

## API Endpoints

### Game Listing

#### Get All Games
```
GET /api/games
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `category` (string): Filter by category
- `difficulty` (string): Filter by difficulty
- `gameType` (string): Filter by game type
- `featured` (boolean): Filter featured games
- `new` (boolean): Filter new games
- `vipOnly` (boolean): Filter VIP-only games

**Response:**
```json
{
  "success": true,
  "message": "Games retrieved successfully",
  "data": {
    "games": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50,
      "itemsPerPage": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  },
  "statusCode": 200
}
```

#### Get Featured Games
```
GET /api/games/featured
```

#### Get New Games
```
GET /api/games/new
```

#### Get Popular Games
```
GET /api/games/popular
```

#### Get Top Rated Games
```
GET /api/games/top-rated
```

#### Get Games by Tags
```
GET /api/games/tags?tags=puzzle,brain-teaser&limit=20
```

#### Get Location-Based Games
```
GET /api/games/location-based
```

#### Get VIP Games
```
GET /api/games/vip
```

#### Get Game Categories
```
GET /api/games/categories
```

#### Get Game Statistics
```
GET /api/games/stats
```

### Game Details

#### Get Game by ID
```
GET /api/games/:id
```

#### Play Game
```
POST /api/games/:id/play
```

**Request Body:**
```json
{
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

#### Complete Game
```
POST /api/games/:id/complete
```

**Request Body:**
```json
{
  "score": 1500,
  "timeSpent": 300,
  "achievements": ["first_win", "high_score"]
}
```

#### Rate Game
```
POST /api/games/:id/rate
```

**Request Body:**
```json
{
  "rating": 4.5,
  "comment": "Great game!"
}
```

### Game Progress

#### Get User's Game Progress
```
GET /api/games/progress
```

#### Get Game Progress by Game ID
```
GET /api/games/progress/:gameId
```

#### Get Game Achievements
```
GET /api/games/achievements
```

#### Get Game Leaderboard
```
GET /api/games/:gameId/leaderboard?limit=10
```

### Admin Endpoints

#### Toggle Game Featured Status
```
PATCH /api/games/:id/toggle-featured
```

#### Toggle Game Active Status
```
PATCH /api/games/:id/toggle-active
```

#### Add Tag to Game
```
POST /api/games/:id/tags
```

**Request Body:**
```json
{
  "tag": "new-tag"
}
```

#### Remove Tag from Game
```
DELETE /api/games/:id/tags/:tag
```

## Model Methods

### Instance Methods

#### `isAvailableForUser(user)`
Checks if a game is available for a specific user based on VIP status, age range, and gender.

#### `getRewardForUser(user)`
Calculates the reward for a specific user, applying VIP multipliers if applicable.

#### `updateStats(points, cashback)`
Updates game statistics after a play session.

#### `updateRating(newRating)`
Updates the game's average rating.

#### `addTag(tag)`
Adds a tag to the game.

#### `removeTag(tag)`
Removes a tag from the game.

#### `toggleFeatured()`
Toggles the featured status of the game.

#### `toggleActive()`
Toggles the active status of the game.

#### `getDailyLimits()`
Returns the daily limits for points and cashback.

### Static Methods

#### `findActive()`
Finds all active games.

#### `findFeatured()`
Finds all featured games.

#### `findNew()`
Finds all new games.

#### `findByCategory(category)`
Finds games by category.

#### `findByDifficulty(difficulty)`
Finds games by difficulty.

#### `findForUser(user)`
Finds games available for a specific user.

#### `findPopular(limit)`
Finds the most popular games.

#### `findTopRated(limit)`
Finds the top-rated games.

#### `findByTags(tags, limit)`
Finds games by tags.

#### `findLocationBased()`
Finds location-based games.

#### `findVipGames()`
Finds VIP-only games.

#### `getGameStats()`
Gets overall game statistics.

#### `getCategoryStats()`
Gets statistics by category.

## Validation

### Pre-save Middleware

The Game model includes pre-save middleware that validates:

1. **Color Codes**: Ensures hex color codes are in valid format (#RRGGBB)
2. **Game URLs**: Validates URL format for external games
3. **New Game Status**: Automatically sets `isNew` to false after 30 days

### Error Handling

The model includes comprehensive error handling for:
- Invalid color formats
- Invalid URL formats
- Rating validation (0-5 range)
- Required field validation

## Indexes

The following indexes are created for optimal performance:

- `category`: For filtering by category
- `difficulty`: For filtering by difficulty
- `isActive`: For active game queries
- `isFeatured`: For featured game queries
- `isNew`: For new game queries
- `isVipOnly`: For VIP game queries
- `ageRange`: For age-based filtering
- `gender`: For gender-based filtering
- `totalPlays`: For popularity sorting
- `averageRating`: For rating-based sorting
- `createdAt`: For chronological sorting
- `tags`: For tag-based queries
- `popularityScore`: For popularity-based sorting

## Testing

The Game model includes comprehensive tests covering:

- Schema validation
- Virtual field calculations
- Instance methods
- Static methods
- Pre-save middleware validation
- Error handling

Run tests with:
```bash
npm test tests/game.test.js
```

## Usage Examples

### Creating a New Game
```javascript
const game = new Game({
  title: 'Puzzle Master',
  description: 'Challenge your mind with brain teasers',
  category: 'puzzle',
  difficulty: 'medium',
  pointsReward: 100,
  cashbackReward: 0.50,
  tags: ['puzzle', 'brain-teaser', 'logic'],
  isActive: true,
  isNew: true
});

await game.save();
```

### Finding Games for a User
```javascript
const user = await User.findById(userId);
const availableGames = await Game.findForUser(user);
```

### Updating Game Statistics
```javascript
const game = await Game.findById(gameId);
await game.updateStats(50, 0.25);
```

### Getting Game Statistics
```javascript
const stats = await Game.getGameStats();
const categoryStats = await Game.getCategoryStats();
``` 