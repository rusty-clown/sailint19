const { Faker, ru, en } = require('@faker-js/faker');
const pool = require('./config/db');

// Инициализация Faker с русской и английской локализацией
const faker = new Faker({ locale: [ru, en] }); // Комбинируем ru и en

// Функция для генерации фейковых данных для repairs
async function seedRepairs(count = 100) {
  try {
    // Проверяем, пустая ли таблица
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM repairs');
    if (total > 0) {
      console.log('Таблица repairs уже содержит данные, пропускаем автозаполнение');
      return;
    }

    const repairs = [];
    const statuses = ['pending', 'in_progress', 'completed'];

    for (let i = 0; i < count; i++) {
      repairs.push([
        faker.vehicle.manufacturer(), // Марка (из en)
        faker.vehicle.model(), // Модель (из en)
        faker.number.int({ min: 1990, max: 2025 }), // Год
        faker.lorem.sentence(), // Проблема (из ru)
        statuses[faker.number.int({ min: 0, max: 2 })], // Статус
        faker.number.float({ min: 100, max: 5000, fractionDigits: 2 }), // Цена
        faker.image.url({ width: 200, height: 200 }) // Изображение (URL)
      ]);
    }

    await pool.query(
      'INSERT INTO repairs (brand, model, year, problem, status, price, image) VALUES ?',
      [repairs]
    );
    console.log(`Добавлено ${count} записей в таблицу repairs`);
  } catch (error) {
    console.error('Ошибка при автозаполнении repairs:', error);
  }
}

// Функция для генерации фейковых данных для details
async function seedDetails(count = 100) {
  try {
    // Проверяем, пустая ли таблица
    const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM details');
    if (total > 0) {
      console.log('Таблица details уже содержит данные, пропускаем автозаполнение');
      return;
    }

    const details = [];

    for (let i = 0; i < count; i++) {
      details.push([
        faker.commerce.productName(), // Название (из en)
        faker.commerce.productDescription(), // Описание (из en)
        faker.number.float({ min: 5, max: 500, fractionDigits: 2 }), // Цена
        faker.number.int({ min: 0, max: 100 }), // Количество
        faker.image.url({ width: 200, height: 200 }), // Изображение (URL)
        faker.datatype.boolean(), // Наличие
        faker.number.float({ min: 0.1, max: 10, fractionDigits: 2 }) // Вес
      ]);
    }

    await pool.query(
      'INSERT INTO details (name, description, price, quantity, image, is_available, weight) VALUES ?',
      [details]
    );
    console.log(`Добавлено ${count} записей в таблицу details`);
  } catch (error) {
    console.error('Ошибка при автозаполнении details:', error);
  }
}

// Основная функция автозаполнения
async function seedDatabase() {
  await seedRepairs();
  await seedDetails();
}

module.exports = { seedDatabase };